<?php
/**
 * Plugin Name: UTM Attribution for Gravity Forms
 * Description: Captures UTM and click-ID parameters on entry, persists them for the attribution window, and fills Gravity Forms hidden fields on any later page.
 * Version:     1.0.0
 * Author:      Mesh
 * License:     MIT
 * Requires PHP: 7.2
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

define( 'UAGF_VERSION', '1.0.0' );

/**
 * Configuration. Override any key with the `uagf_config` filter.
 * Cookie format and key match the Webflow script, so attribution carries
 * between a Webflow site and a WordPress site on the same domain family.
 */
function uagf_config() {
	$config = array(
		'key'          => 'pc_attribution',
		'days'         => 90,
		'mode'         => 'last', // 'last' or 'first'.
		'cookieDomain' => '',     // '' auto-derives; set '.example.co.uk' for multi-part TLDs.
		'pushToDataLayer' => true,
		'params'       => array(
			'utm_source', 'utm_medium', 'utm_campaign',
			'utm_term', 'utm_content', 'utm_id',
			'gclid', 'gbraid', 'wbraid',
			'fbclid', 'msclkid', 'ttclid', 'li_fat_id',
		),
		'contextFields' => array( 'landing_page', 'landing_path', 'referrer', 'first_seen' ),
	);
	return apply_filters( 'uagf_config', $config );
}

function uagf_field_names() {
	$c = uagf_config();
	return array_merge( $c['params'], $c['contextFields'] );
}

/** Read the attribution cookie server-side (it is sent with every request, including form POSTs). */
function uagf_read_cookie() {
	$c = uagf_config();
	if ( empty( $_COOKIE[ $c['key'] ] ) ) {
		return array();
	}
	$decoded = json_decode( wp_unslash( $_COOKIE[ $c['key'] ] ), true );
	if ( ! is_array( $decoded ) ) {
		return array();
	}
	$out = array();
	foreach ( uagf_field_names() as $name ) {
		if ( isset( $decoded[ $name ] ) && is_scalar( $decoded[ $name ] ) && '' !== $decoded[ $name ] ) {
			$out[ $name ] = sanitize_text_field( (string) $decoded[ $name ] );
		}
	}
	return $out;
}

/** Front-end capture script. */
add_action( 'wp_enqueue_scripts', function () {
	wp_enqueue_script( 'uagf', plugins_url( 'assets/utm-attribution.js', __FILE__ ), array(), UAGF_VERSION, true );
	wp_add_inline_script( 'uagf', 'window.UTMAttributionConfig=' . wp_json_encode( uagf_config() ) . ';', 'before' );
} );

/**
 * Tag hidden fields whose "Parameter Name" (Allow field to be populated
 * dynamically) matches a tracked name, so the JS can find them. Hidden
 * fields expose no parameter name in the DOM otherwise.
 */
add_filter( 'gform_pre_render', function ( $form ) {
	$names = uagf_field_names();
	foreach ( $form['fields'] as $field ) {
		if ( 'hidden' === $field->type && in_array( $field->inputName, $names, true ) ) {
			$field->cssClass = trim( $field->cssClass . ' uagf-field uagf-field--' . $field->inputName );
		}
	}
	return $form;
} );

/** Server-side population from the cookie (works for non-cached pages, even if JS is blocked). */
add_action( 'init', function () {
	foreach ( uagf_field_names() as $name ) {
		add_filter( 'gform_field_value_' . $name, function ( $value ) use ( $name ) {
			$data = uagf_read_cookie();
			return isset( $data[ $name ] ) ? $data[ $name ] : $value;
		} );
	}
} );

/**
 * Safety net at submission: a page cache or blocked JS can leave tagged hidden
 * fields empty, but the cookie still arrives with the POST. Fill from it.
 */
add_action( 'gform_pre_submission', function ( $form ) {
	$data = uagf_read_cookie();
	if ( ! $data ) {
		return;
	}
	foreach ( $form['fields'] as $field ) {
		if ( 'hidden' !== $field->type || ! isset( $data[ $field->inputName ] ) ) {
			continue;
		}
		$key = 'input_' . $field->id;
		if ( empty( $_POST[ $key ] ) ) {
			$_POST[ $key ] = $data[ $field->inputName ];
		}
	}
} );
